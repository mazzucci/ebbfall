// The link preview image, public/og.png (1200x630: Open Graph's og:image and X's summary_large_image, index.html): the
// game's look (its dark ground #0b0f16, the icon, the wordmark in the menu's font) over the battle of tools/scene.mjs (the
// same scene the menu's first page shows under it, tools/menu-art.mjs) as a picture painted over that composition
// (PICTURE in the local pictures folder, EBBFALL_PICTURES: never committed; without it this stops), cropped round the
// meeting (`CROP`), then the card as a page in headless Chromium
// (tools/chromium.mjs) and written as a PNG. Kept small for the apps that fetch it (WhatsApp skips large images):
// the screenshot's colors are reduced to a palette (an indexed PNG) when that is what fits. Run after changing the
// icon, the art or the wording:
//   node tools/og.mjs [out.png]     (default public/og.png; output is committed; OG_RAW=raw.png also writes the
//                                    screenshot before its colors are reduced)
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { launchChromium } from './chromium.mjs';
import { chunk } from './art/png.js';
import { existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const out = process.argv[2] || new URL('public/og.png', root).pathname;
const W = 1200, H = 630, BUDGET = 300 * 1024, DITHER = 0.8;

/** What the card says: the wordmark, and one line under it (index.html's og:title says the same). */
const TAG = 'A free browser RTS: a kingdom against time travelers';
const SUB = 'KINGDOM VS EXPEDITION · AI OR FRIENDS ONLINE · PHONE OR DESKTOP';

/** The picture (6336x2688) and the part of it the card shows: the meeting, both bases' edges in, the gap in the
 *  middle (x, y, w, h in its px; the card's aspect). The card's veil (#veil) fades its top under the title. */
const PICTURE = (process.env.EBBFALL_PICTURES || '/home/mazzucci/projects/ebbfall-article/nano-test') + '/opt/band/a-1.jpg';
const CROP = [528, 0, 5120, 2688];
if (!existsSync(PICTURE)) { console.error(`og: the picture is not there: ${PICTURE}\nIt is local, never in the repo: set EBBFALL_PICTURES to the pictures' folder. Nothing was changed.`); process.exit(1); }

const css = readFileSync(new URL('src/style.css', root), 'utf8').match(/:root\s*\{[^}]*\}/)[0];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Chakra Petch';font-weight:600;src:url('/src/fonts/chakra-petch-600.woff2') format('woff2')}
@font-face{font-family:'Chakra Petch';font-weight:700;src:url('/src/fonts/chakra-petch-700.woff2') format('woff2')}
@font-face{font-family:'Share Tech Mono';font-weight:400;src:url('/src/fonts/share-tech-mono-400.woff2') format('woff2')}
${css}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
#card{position:relative;width:${W}px;height:${H}px;background:radial-gradient(90% 80% at 50% 22%,#18222f 0%,var(--bg) 60%)}
canvas{position:absolute;inset:0}
/* the night over the field: the card's ground fades out under the title */
#veil{position:absolute;inset:0;background:linear-gradient(180deg,var(--bg) 0%,rgba(11,15,22,.92) 34%,rgba(11,15,22,.35) 58%,rgba(11,15,22,0) 72%,rgba(11,15,22,0) 88%,rgba(11,15,22,.55) 100%)}
#side{position:absolute;inset:0;background:linear-gradient(90deg,rgba(11,15,22,.55) 0%,rgba(11,15,22,0) 14%,rgba(11,15,22,0) 86%,rgba(11,15,22,.55) 100%)}
#title{position:absolute;left:0;right:0;top:52px;display:flex;flex-direction:column;align-items:center;color:var(--fg);font-family:var(--display)}
#name{display:flex;align-items:center;gap:26px}
#name img{width:118px;height:118px;filter:drop-shadow(0 0 18px rgba(245,165,36,.18))}
#name h1{margin:0;font:700 128px/1 var(--display);letter-spacing:.03em;color:#eef3f8;text-shadow:0 4px 24px rgba(0,0,0,.6)}
#tag{margin-top:16px;font:600 38px/1.1 var(--display);letter-spacing:.02em;color:var(--ally2);text-shadow:0 2px 12px rgba(0,0,0,.9)}
#sub{margin-top:14px;font:400 21px/1 var(--mono);letter-spacing:.14em;color:var(--fg);opacity:.82;text-shadow:0 2px 10px rgba(0,0,0,1)}
</style></head><body><div id="card">
<canvas id="c" width="${W}" height="${H}"></canvas><div id="veil"></div><div id="side"></div>
<div id="title"><div id="name"><img src="/public/icon.svg" alt=""><h1>Ebbfall</h1></div><div id="tag">${TAG}</div><div id="sub">${SUB}</div></div>
</div><script>
const W = ${W}, H = ${H}, CROP = ${JSON.stringify(CROP)};
const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error(src.slice(0, 40))); i.src = src; });
window.ready = (async () => {
  const g = document.getElementById('c').getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(await load('/picture.jpg'), ...CROP, 0, 0, W, H);
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.decode()));
})();
</script></body></html>`;

const TYPES = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2' };
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // The page and the repo's files from one made-up origin (fonts and images load as from a server, not file://).
  await page.route('https://og.invalid/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (path === '/picture.jpg') return route.fulfill({ contentType: 'image/jpeg', body: readFileSync(PICTURE) });
    return route.fulfill({ contentType: TYPES[path.split('.').pop()] || 'application/octet-stream', body: readFileSync(new URL('.' + path, root)) });
  });
  page.on('pageerror', (e) => { throw e; });
  await page.goto('https://og.invalid/');
  await page.evaluate(() => window.ready);
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  if (process.env.OG_RAW) writeFileSync(process.env.OG_RAW, shot);
  // (the screenshot's pixels, read back through a canvas: Chromium writes RGB, which the art's decoder does not read)
  const pixels = () => page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, data: [...g.getImageData(0, 0, c.width, c.height).data] };
  }, shot.toString('base64'));
  const png = shot.length <= BUDGET ? shot : indexed(await pixels());
  writeFileSync(out, png);
  console.log(`og: wrote ${out} (${W}x${H}, ${Math.round(png.length / 1024)} KB${png === shot ? '' : ', 256 colours'})`);
  if (png.length > BUDGET) throw new Error(`og: ${Math.round(png.length / 1024)} KB, over the ${BUDGET / 1024} KB budget`);
} finally { await browser.close(); }

/**
 * RGBA pixels reduced to 256 colors (median cut over the image's colors, each pixel its nearest palette entry after
 * a light error diffusion, DITHER: gradients keep from banding, flat areas stay flat and compress), written as an
 * indexed PNG (color type 3), opaque, filter 0 on every row.
 */
function indexed({ w, h, data }) {
  const n = w * h, rgb = new Uint32Array(n);
  for (let i = 0; i < n; i++) rgb[i] = (data[i * 4] << 16) | (data[i * 4 + 1] << 8) | data[i * 4 + 2];
  const counts = new Map();
  for (const c of rgb) counts.set(c, (counts.get(c) || 0) + 1);
  // Median cut: split the box with the widest channel range (weighted by pixels) until there are 256.
  let boxes = [[...counts.keys()]];
  const ch = (c, k) => (c >> (16 - 8 * k)) & 255;
  while (boxes.length < 256) {
    let best = -1, bk = 0, bi = -1;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = 255, hi = 0; for (const c of b) { const v = ch(c, k); if (v < lo) lo = v; if (v > hi) hi = v; }
        const score = (hi - lo) * Math.sqrt(b.reduce((s, c) => s + counts.get(c), 0));
        if (score > best) { best = score; bk = k; bi = i; }
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].sort((x, y) => ch(x, bk) - ch(y, bk)), total = b.reduce((s, c) => s + counts.get(c), 0);
    let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += counts.get(b[i]); if (acc >= total / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = boxes.map(b => { let r = 0, g = 0, bl = 0, t = 0; for (const c of b) { const k = counts.get(c); r += ch(c, 0) * k; g += ch(c, 1) * k; bl += ch(c, 2) * k; t += k; } return [r / t, g / t, bl / t].map(Math.round); });
  const near = new Map();
  const idx = (c) => {
    let i = near.get(c);
    if (i === undefined) {
      let bd = Infinity; const r = ch(c, 0), g = ch(c, 1), b = ch(c, 2);
      pal.forEach(([pr, pg, pb], j) => { const d = (pr - r) ** 2 * 2 + (pg - g) ** 2 * 4 + (pb - b) ** 2 * 3; if (d < bd) { bd = d; i = j; } });
      near.set(c, i);
    }
    return i;
  };
  // Floyd-Steinberg error diffusion (a gradient's steps become a fine grain instead of bands), the error carried in
  // floats per row; nearest entries cached by the color asked for, rounded.
  const raw = Buffer.alloc((w + 1) * h);
  let err = new Float32Array((w + 2) * 3), next = new Float32Array((w + 2) * 3);
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let y = 0; y < h; y++) {
    next.fill(0);
    for (let x = 0; x < w; x++) {
      const c = rgb[y * w + x], e = (x + 1) * 3;
      const want = [ch(c, 0) + err[e], ch(c, 1) + err[e + 1], ch(c, 2) + err[e + 2]].map(clamp);
      const i = idx((want[0] << 16) | (want[1] << 8) | want[2]), p = pal[i];
      raw[y * (w + 1) + 1 + x] = i;
      for (let k = 0; k < 3; k++) {
        const d = (want[k] - p[k]) * DITHER;
        err[e + 3 + k] += d * 7 / 16; next[e - 3 + k] += d * 3 / 16; next[e + k] += d * 5 / 16; next[e + 3 + k] += d / 16;
      }
    }
    [err, next] = [next, err];
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', Buffer.from(pal.flat())), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
