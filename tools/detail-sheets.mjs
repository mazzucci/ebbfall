// detail-exp (never merged; after tools/hd-sheets.mjs): the judge's pictures from target/detail/shots
// (tools/detail-capture.mjs), drawn on a canvas in one headless Chromium (pixels copied, never smoothed or resized).
//   node tools/detail-sheets.mjs <outdir>
//   full/    the screenshots as shot                                   <screen>--<view>--<today|detail>.png
//   sheets/  one region of both versions side by side, 1:1, labeled;   fullscreen--*: the whole screens
//   crops/   one thing (the Knight, the Data center, the mine, the ground), 1:1, a file per version
//   blind/   the sheets and the crops' pairs with the two versions shuffled under A and B (key.json)
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), shots = join(root, 'target/detail/shots'), out = resolve(process.argv[2]);
for (const d of ['full', 'crops', 'sheets', 'blind']) mkdirSync(join(out, d), { recursive: true });
const VERSIONS = [['today', "today's art, as shipped (1x)"], ['detail', 'the detailed models (2x)']];
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const logs = Object.fromEntries(['retina', 'desktop', 'phone'].filter(r => existsSync(join(shots, r, 'shots.json'))).map(r => [r, JSON.parse(readFileSync(join(shots, r, 'shots.json'), 'utf8'))]));
// the screens: [id, run, the fight's view or the views zoomed in by subject]
const SCREENS = [
  ['1-retina-default', 'retina', { all: 'fight' }],
  ['2-retina-max', 'retina', { knight: 'max-knight', datacenter: 'max-datacenter', mine: 'max-mine', ground: 'max-knight' }],
  ['3-desktop-default', 'desktop', { all: 'fight' }],
];
/** The crops' boxes in world px: [x, y, w, h]. */
const boxes = (s) => ({ knight: [s.pick.x - 58, s.pick.y - 78, 116, 116], datacenter: [s.hall.x - 104, s.hall.y - 138, 222, 240], mine: [s.mine.x - 52, s.mine.y - 72, 104, 112], ground: [s.pick.x + 20, s.pick.y + 40, 150, 90] });

const browser = await launchChromium(), key = {};
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
    window.sheet = async ({ panels, title = '', gap = 8, bare = false }) => {
      const imgs = await Promise.all(panels.map(p => load(p.src)));
      const pw = panels.map(p => p.sw), ph = Math.max(...panels.map(p => p.sh)), head = bare ? 0 : 26, top = bare || !title ? 0 : 28;
      const c = document.createElement('canvas'); c.width = pw.reduce((a, b) => a + b, 0) + gap * (panels.length - 1); c.height = top + head + ph;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      if (!bare) { g.fillStyle = '#14181f'; g.fillRect(0, 0, c.width, c.height); }
      g.font = '15px sans-serif'; g.textBaseline = 'middle';
      if (top) { g.fillStyle = '#c9d2e0'; g.fillText(title, 6, 14); }
      let x = 0;
      panels.forEach((p, i) => {
        g.drawImage(imgs[i], p.sx, p.sy, p.sw, p.sh, x, top + head, p.sw, p.sh);
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
  /** A pair's sheet, and the same shuffled under A and B in blind/. */
  const pair = async (name, rect, src, title) => {
    const panel = ([v, label]) => ({ src: src(v), ...rect, label });
    await draw(join(out, 'sheets', `${name}.png`), { panels: VERSIONS.map(panel), title });
    const rnd = mulberry([...name].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 11)), order = rnd() < 0.5 ? [0, 1] : [1, 0];
    key[name] = Object.fromEntries(order.map((i, k) => ['AB'[k], VERSIONS[i][0]]));
    await draw(join(out, 'blind', `${name}.png`), { panels: order.map((i, k) => panel([VERSIONS[i][0], 'AB'[k]])), title: title.replace(/;.*$/, '') });
  };

  for (const [id, run, viewsOf] of SCREENS) {
    const log = logs[run]; if (!log) continue;
    const [W, H] = log.viewport, dpr = log.dpr, PW = W * dpr, PH = H * dpr, B = log.canvasBox, bx = boxes(log.setup);
    const src = (view) => (v) => url(join(shots, run, `${view}-${v}.png`));
    const views = [...new Set(Object.values(viewsOf))];
    for (const view of views) {
      const v = log.views[view], what = `${PW}x${PH} device px (a ${W}x${H} window at DPR ${dpr}), zoom ${(+v.zoom).toFixed(2)}`;
      const vname = view === 'fight' ? 'fight' : view.replace('max-', '');
      for (const [ver] of VERSIONS) copyFileSync(join(shots, run, `${view}-${ver}.png`), join(out, 'full', `${id}--${vname}--${ver}.png`));
      // the sheet's region: round the view's middle, at most 1270 px a panel (two fill a 2560 px sheet), inside the canvas
      const cw = Math.min(Math.round(B.width * dpr), dpr === 1 ? 940 : 1270), ch = Math.min(Math.round(B.height * dpr), dpr === 1 ? 760 : 1180);
      const mid = view === 'fight' ? [((log.setup.hall.x + 30 - v.cam.x) * v.cam.zoom + B.x) * dpr, ((log.setup.hall.y + 60 - v.cam.y) * v.cam.zoom + B.y) * dpr] : [(B.x + B.width / 2) * dpr, (B.y + B.height / 2) * dpr];
      const sx = Math.round(Math.max(B.x * dpr, Math.min((B.x + B.width) * dpr - cw, mid[0] - cw / 2))), sy = Math.round(Math.max(B.y * dpr, Math.min((B.y + B.height) * dpr - ch, mid[1] - ch / 2)));
      await pair(`${id}--${vname}`, { sx, sy, sw: cw, sh: ch }, src(view), `${id}, ${vname}: ${what}; one region of the frame at 1:1 (device px), the same instant in both`);
      if (view === 'fight' && id.startsWith('1-')) await pair(`fullscreen--${id}`, { sx: 0, sy: 0, sw: PW, sh: PH }, src(view), `the whole screen: ${what}; 1:1 (device px), the same instant in both`);
      await page.evaluate(() => window.drop());
    }
    // the crops: each subject from its view, the same rectangle in both versions
    for (const [what, box] of Object.entries(bx)) {
      const view = viewsOf[what] || viewsOf.all, v = log.views[view]; if (!v) continue;
      const x = Math.round(((box[0] - v.cam.x) * v.cam.zoom + B.x) * dpr), y = Math.round(((box[1] - v.cam.y) * v.cam.zoom + B.y) * dpr), w = Math.round(box[2] * v.cam.zoom * dpr), h = Math.round(box[3] * v.cam.zoom * dpr);
      if (x < B.x * dpr || y < B.y * dpr || x + w > (B.x + B.width) * dpr || y + h > (B.y + B.height) * dpr) { console.log(`${id} ${what}: outside the view, skipped`); continue; }
      for (const [ver] of VERSIONS) await draw(join(out, 'crops', `${id}--${what}--${ver}.png`), { panels: [{ src: src(view)(ver), sx: x, sy: y, sw: w, sh: h, label: '' }], bare: true });
      const rnd = mulberry([...`${id}${what}`].reduce((a, c) => a * 31 + c.charCodeAt(0) | 0, 5)), order = rnd() < 0.5 ? [0, 1] : [1, 0];
      key[`crop--${id}--${what}`] = Object.fromEntries(order.map((i, k) => ['AB'[k], VERSIONS[i][0]]));
      await draw(join(out, 'blind', `crop--${id}--${what}.png`), { panels: order.map((i, k) => ({ src: src(view)(VERSIONS[i][0]), sx: x, sy: y, sw: w, sh: h, label: 'AB'[k] })), title: '' });
    }
    await page.evaluate(() => window.drop());
    console.log(id);
  }
  // the phone, today's art: the polish reference, labeled (never in blind/)
  if (logs.phone) {
    const log = logs.phone, [W, H] = log.viewport, dpr = log.dpr, f = join(shots, 'phone', 'fight-today.png');
    copyFileSync(f, join(out, 'full', 'phone--fight--today.png'));
    await draw(join(out, 'sheets', 'fullscreen--phone-today.png'), { panels: [{ src: url(f), sx: 0, sy: 0, sw: W * dpr, sh: H * dpr, label: "today's art on a landscape phone" }], title: `the same moment on a phone: ${W * dpr}x${H * dpr} device px (${W}x${H} at DPR ${dpr}, a touch screen), zoom ${log.views.fight.zoom}; 1:1` });
  }
  for (const run of Object.keys(logs)) if (existsSync(join(shots, run, 'hud-today.png'))) copyFileSync(join(shots, run, 'hud-today.png'), join(out, 'full', `${run}--hud--today.png`));
  writeFileSync(join(out, 'blind', 'key.json'), JSON.stringify(key, null, 1));
} finally { await browser.close(); }
console.log('written to', out);
