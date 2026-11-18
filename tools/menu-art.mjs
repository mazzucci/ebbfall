// The field under the menu's first page, public/menu/menu-<class>.webp (index.html's <picture class="scene">): og.png's
// battle as a band, the Castle and its Watchtower on the left, the Data center and its Wind turbine on the right,
// Knights, Guards, Archers and a Rider marching east into Buggies, Mercenaries, Androids and a Launcher marching west,
// the gold and a blast between them, a Balloon and Drones in the air. The sprites come from the game's own 3D models
// (tools/render3d, through tools/art/render3d.mjs) rendered at twice the atlas's scale (`zoom`: a sprite drawn larger,
// not stretched), the ground and the effects from the atlas (public/art), each unit its neutral render and its team
// mask tinted as the client tints it (the Kingdom in seat 0's color, the Expedition in seat 1's). One image per size
// class, the aspect of the band it fills on that class's reference screen (so `cover` crops nothing there), the night
// veil and the top fade baked in (the page's own floor shows through the top), written as WebP by Chromium's encoder.
// Run after changing the models, the ground or the scene:
//   node tools/menu-art.mjs [out dir]     (default public/menu/; output is committed. MENU_ART_SPRITES=dir keeps the
//                                          renders there between runs: the 2-minute render step is skipped when it holds them)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { render3d } from './art/render3d.mjs';
import { encodePNG, decodePNG } from './art/png.js';
import { launchChromium } from './chromium.mjs';
import * as SCENE from './scene.mjs';

const root = new URL('../', import.meta.url);
const out = process.argv[2] || new URL('public/menu/', root).pathname;
const ZOOM = 2, QUALITY = 0.72, BUDGET = 100 * 1024;
const BG = [11, 15, 22]; // --bg

/**
 * The size classes: image px, `k` the scale of the zoom-2 sprites (k = 0.5 is the atlas's own scale, og.png's), `fade`
 * how much of the top fades to nothing. The band is 40 px wider than the screen (the drift) and 8 px lower; its height
 * is style.css's: 40% of the screen (desktop and wide: 1440x900 and 2560x1080 as references), 36% on a short phone
 * (844x390), 26% upright (390x844). The landscape image is shown at 2x on a phone (a 3x screen upsamples it 1.5x).
 */
const CLASSES = {
  wide: { W: 2560, H: 480, k: 0.6, fade: 0.62, clear: [.16, .48] },
  desktop: { W: 1920, H: 480, k: 0.6, fade: 0.66, clear: [.2, .56] },
  landscape: { W: 1688, H: 268, k: 0.40, fade: 0.66, clear: [.3, .56] },
  portrait: { W: 780, H: 398, k: 0.45, fade: 0.50 },
};
// `clear`: a clearing at the top middle of the band (an ellipse from the band's top edge, its radii as fractions of
// the width and height), faded further: the menu's footer line sits there on short screens, and the card's stamp.

/** Each class's scene (tools/scene.mjs: [frame, x, y, seat, scale], shared with og.mjs; the desktop's is og.png's band). */
const SCENES = { wide: SCENE.WIDE, desktop: SCENE.BAND, landscape: SCENE.LANDSCAPE, portrait: SCENE.PORTRAIT };
/** The night over the field: --bg over the art by height (dark at the faded top, lightest where the armies stand, a
 *  dark foot under the water's edge), then the top faded to nothing. */
const VEIL = [[0, .6], [.5, .2], [.80, .24], [.86, .32], [.93, .74], [1, .88]];

// ---- step 1: the sprites, rendered (or read back from MENU_ART_SPRITES) ----
const NAMES = [...new Set(Object.values(SCENES).flatMap(SCENE.frames3d))];
const cache = process.env.MENU_ART_SPRITES;
let sprites;
if (cache && existsSync(join(cache, 'meta.json'))) {
  const meta = JSON.parse(readFileSync(join(cache, 'meta.json')));
  sprites = Object.assign(Object.entries(meta.sprites).map(([name, m]) => ({ name, anchor: m.anchor, img: decodePNG(readFileSync(join(cache, `${name}.png`))) })), { tints: meta.tints });
  console.log(`menu-art: ${sprites.length} sprites from ${cache}`);
} else {
  const t0 = Date.now();
  sprites = await render3d(`^(${NAMES.join('|')})(_m)?$`, { zoom: ZOOM });
  console.log(`menu-art: rendered ${sprites.length} sprites at zoom ${ZOOM} in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (cache) {
    mkdirSync(cache, { recursive: true });
    for (const s of sprites) writeFileSync(join(cache, `${s.name}.png`), encodePNG(s.img));
    writeFileSync(join(cache, 'meta.json'), JSON.stringify({ zoom: ZOOM, tints: sprites.tints, sprites: Object.fromEntries(sprites.map(s => [s.name, { w: s.img.w, h: s.img.h, anchor: s.anchor }])) }));
  }
}
const missing = NAMES.filter(n => !sprites.some(s => s.name === n));
if (missing.length) throw new Error(`menu-art: no sprite for ${missing.join(', ')}`);
const META = Object.fromEntries(sprites.map(s => [s.name, { w: s.img.w, h: s.img.h, anchor: s.anchor }]));
const DATA = Object.fromEntries(sprites.map(s => [s.name, encodePNG(s.img).toString('base64')]));

// ---- step 2: each class composed in a page, as og.mjs composes the card ----
const atlasIndex = JSON.parse(readFileSync(new URL('public/art/atlas.json', root)));
const ATLAS = { pages: atlasIndex.pages.map(p => JSON.parse(readFileSync(new URL(`public/art/${p}`, root)))) };
const pageHtml = (cls) => {
  const { W, H, k, fade } = CLASSES[cls], scene = SCENES[cls];
  const names = new Set(scene.map(s => s[0]).flatMap(n => [n, `${n}_m`]).filter(n => DATA[n]));
  return `<!doctype html><html><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const META = ${JSON.stringify(META)}, ATLAS = ${JSON.stringify(ATLAS)}, SCENE = ${JSON.stringify(scene)}, DATA = ${JSON.stringify(Object.fromEntries([...names].map(n => [n, DATA[n]])))};
const W = ${W}, H = ${H}, k = ${k}, FADE = ${fade}, TINTS = ${JSON.stringify(sprites.tints)}, VEIL = ${JSON.stringify(VEIL)}, BG = ${JSON.stringify(BG)}, Q = ${QUALITY};
const groundTile = ${SCENE.groundTile.toString()}, CLEAR = ${JSON.stringify(CLASSES[cls].clear || null)};
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src.slice(0, 40))); i.src = src; });
window.ready = (async () => {
  const pages = await Promise.all(ATLAS.pages.map(p => load('/public/art/' + p.meta.image)));
  const imgs = {}; for (const n of Object.keys(DATA)) imgs[n] = await load('data:image/png;base64,' + DATA[n]);
  const findAtlas = (n) => { const i = ATLAS.pages.findIndex(p => p.frames[n]); if (i < 0) throw new Error('no atlas frame ' + n); return { img: pages[i], f: ATLAS.pages[i].frames[n] }; };
  const g = document.getElementById('c').getContext('2d'); g.imageSmoothingQuality = 'high';
  // A 3D sprite with its anchor at (x, y), scaled by k; an atlas frame (the ground, the effects) at 2k (the atlas is at
  // half the sprites' zoom; trimmed frames: their offset in the source box, as og.mjs draws them).
  const draw3d = (ctx, n, x, y, s) => { const m = META[n]; ctx.drawImage(imgs[n], x - m.anchor.x * m.w * s, y - m.anchor.y * m.h * s, m.w * s, m.h * s); };
  const drawAtlas = (ctx, n, x, y, s) => { const { img, f } = findAtlas(n), r = f.frame, o = f.spriteSourceSize, a = f.anchor || { x: 0, y: 0 }; ctx.drawImage(img, r.x, r.y, r.w, r.h, x - a.x * f.sourceSize.w * s + o.x * s, y - a.y * f.sourceSize.h * s + o.y * s, r.w * s, r.h * s); };
  // The ground: the terrain's plain cells as the game lays them (scene.mjs groundTile picks the variant).
  const T = 128 * k;
  for (let ty = -1; ty * T < H; ty++) for (let tx = -1; tx * T < W; tx++) drawAtlas(g, groundTile(tx, ty), tx * T, ty * T, 2 * k);
  // The scene: a unit or building is its neutral render, then its team mask tinted with the seat's tint (a multiply);
  // a figure with a scale of its own that much larger.
  const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const t = tmp.getContext('2d');
  for (const [n, fx, fy, seat, scale] of SCENE) {
    const x = fx * W, y = fy * H, s = k * (scale ?? 1);
    if (!META[n]) { drawAtlas(g, n, x, y, 2 * s); continue; }
    draw3d(g, n, x, y, s);
    if (seat === null || !imgs[n + '_m']) continue;
    const col = '#' + TINTS[seat].toString(16).padStart(6, '0');
    t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, W, H); draw3d(t, n + '_m', x, y, s);
    t.globalCompositeOperation = 'multiply'; t.fillStyle = col; t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = 'destination-in'; draw3d(t, n + '_m', x, y, s);
    g.drawImage(tmp, 0, 0);
  }
  // The veil over the art, then the top faded to nothing (the page's floor shows through).
  const rgba = (a) => 'rgba(' + BG.join(',') + ',' + a + ')';
  g.globalCompositeOperation = 'source-atop';
  let lg = g.createLinearGradient(0, 0, 0, H); for (const [p, a] of VEIL) lg.addColorStop(p, rgba(a)); g.fillStyle = lg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  lg = g.createLinearGradient(0, 0, 0, H * FADE); lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(0.3, 'rgba(0,0,0,.82)'); lg.addColorStop(0.65, 'rgba(0,0,0,.4)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, W, H * FADE);
  if (CLEAR) { // (the clearing at the top middle: the footer line's room)
    const rg = g.createRadialGradient(W / 2, 0, 0, W / 2, 0, 1); rg.addColorStop(0, 'rgba(0,0,0,.75)'); rg.addColorStop(0.6, 'rgba(0,0,0,.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(W / 2, 0); g.scale(CLEAR[0] * W, CLEAR[1] * H); g.translate(-W / 2, 0); g.fillStyle = rg; g.fillRect(W / 2 - 1, 0, 2, 1); g.restore();
  }
  return document.getElementById('c').toDataURL('image/webp', Q).split(',')[1];
})();
</script></body></html>`;
};

const TYPES = { png: 'image/png' };
mkdirSync(out, { recursive: true });
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => { throw e; });
  let html = '';
  await page.route('https://menu.invalid/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    return route.fulfill({ contentType: TYPES[path.split('.').pop()] || 'application/octet-stream', body: readFileSync(new URL('.' + path, root)) });
  });
  for (const cls of Object.keys(CLASSES)) {
    html = pageHtml(cls);
    await page.goto('https://menu.invalid/');
    const webp = Buffer.from(await page.evaluate(() => window.ready), 'base64');
    const file = join(out, `menu-${cls}.webp`);
    writeFileSync(file, webp);
    console.log(`menu-art: wrote ${file} (${CLASSES[cls].W}x${CLASSES[cls].H}, ${(webp.length / 1024).toFixed(1)} KB)`);
    if (webp.length > BUDGET) throw new Error(`menu-art: ${cls} is ${Math.round(webp.length / 1024)} KB, over the ${BUDGET / 1024} KB budget`);
  }
} finally { await browser.close(); }
