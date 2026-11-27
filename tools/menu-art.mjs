// The field under the menu's first page, public/menu/menu-<class>.webp (index.html's <picture class="scene">): og.png's
// battle as a band (tools/scene.mjs, composed by tools/field.mjs from the game's land, its buildings' pack built at 4x
// and the units' sharp pictures, which are local: EBBFALL_PICTURES). One image per size class, the aspect of the band
// it fills on that class's reference screen (so `cover` crops nothing there), the night veil and the top fade baked
// in, written as WebP by Chromium's encoder. Opaque: the fade goes into the floor's own color (style.css's --panel,
// FLOOR), not to transparent. Safari on iPhone and iPad (Apple's image decoder, iOS 26) drew these WebPs' alpha as
// opaque, a hard-edged band with no fade; Playwright's WebKit decodes WebP with libwebp and never showed it. An opaque
// image looks the same in every browser (test/menu-art.test.js keeps them without an alpha channel).
// Run after changing the art or the scene:
//   node tools/menu-art.mjs [out dir]     (default public/menu/; output is committed)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
import { field } from './field.mjs';
import { P_PER_H } from './scene.mjs';

const root = new URL('../', import.meta.url);
const out = process.argv[2] || new URL('public/menu/', root).pathname;
const QUALITY = 0.72, BUDGET = 100 * 1024;
const BG = [11, 15, 22]; // --bg
const FLOOR = '#121a25'; // --panel, the menu's floor (style.css): the color the top fades into

/**
 * The size classes: image px, `fade` how much of the top fades to nothing, `crop` (the upright phone's) its middle and
 * width as shares of the desktop's field. The band is 40 px wider than the screen and 8 px lower (once room for a
 * drift, now gone); its height is style.css's: 40% of the screen (desktop and wide: 1440x900 and 2560x1080 as
 * references), 36% on a short phone (844x390), 26% upright (390x844). The landscape image is shown at 2x on a phone
 * (a 3x screen upsamples it 1.5x).
 */
const CLASSES = {
  wide: { W: 2560, H: 480, fade: 0.62, clear: [.16, .48] },
  desktop: { W: 1920, H: 480, fade: 0.66, clear: [.2, .56] },
  landscape: { W: 1688, H: 268, fade: 0.66, clear: [.3, .56] },
  portrait: { W: 780, H: 398, fade: 0.50, crop: [0.53, 0.49] },
};
// `clear`: a clearing at the top middle of the band (an ellipse from the band's top edge, its radii as fractions of
// the width and height), faded further: the menu's footer line sits there on short screens, and the card's stamp.

/** The night over the field: --bg over the art by height (dark at the faded top, lightest where the armies stand, a
 *  dark foot), then the top faded to nothing. */
const VEIL = [[0, .6], [.5, .2], [.80, .24], [.86, .32], [.93, .74], [1, .88]];

// Each class composed by tools/field.mjs at its own height (P_PER_H: the desktop band's 2.1 px a world px at 480 px),
// the upright phone's a crop of the desktop's field (`crop`: its middle and width as shares of the desktop's); then the
// night veil and the top fade over it in a page, as before.
const pageHtml = (cls, fieldPng) => {
  const { W, H, fade, crop } = CLASSES[cls];
  return `<!doctype html><html><body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const W = ${W}, H = ${H}, FADE = ${fade}, FLOOR = ${JSON.stringify(FLOOR)}, VEIL = ${JSON.stringify(VEIL)}, BG = ${JSON.stringify(BG)}, Q = ${QUALITY};
const CLEAR = ${JSON.stringify(CLASSES[cls].clear || null)}, CROP = ${JSON.stringify(crop || null)};
window.ready = (async () => {
  const img = new Image(); img.src = 'data:image/png;base64,${fieldPng.toString('base64')}'; await img.decode();
  const g = document.getElementById('c').getContext('2d'); g.imageSmoothingQuality = 'high';
  if (CROP) { const cw = CROP[1] * img.width; g.drawImage(img, CROP[0] * img.width - cw / 2, 0, cw, img.height, 0, 0, W, H); } else g.drawImage(img, 0, 0, W, H);
  // The veil over the art, then the top faded to nothing, then the floor's color under it (the floor, as the page shows it).
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
  g.globalCompositeOperation = 'destination-over'; g.fillStyle = FLOOR; g.fillRect(0, 0, W, H); // (the floor under it all: opaque)
  return document.getElementById('c').toDataURL('image/webp', Q).split(',')[1];
})();
</script></body></html>`;
};

const TYPES = { png: 'image/png', webp: 'image/webp' };
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
  const fields = {};
  for (const cls of Object.keys(CLASSES)) {
    const { W, H, crop } = CLASSES[cls], [fw, fh] = crop ? [CLASSES.desktop.W, CLASSES.desktop.H] : [W, H];
    fields[cls] = crop && fields.desktop ? fields.desktop : await field(browser, { W: fw, H: fh, P: P_PER_H * fh });
    html = pageHtml(cls, fields[cls]);
    await page.goto('https://menu.invalid/');
    const webp = Buffer.from(await page.evaluate(() => window.ready), 'base64');
    const file = join(out, `menu-${cls}.webp`);
    writeFileSync(file, webp);
    console.log(`menu-art: wrote ${file} (${CLASSES[cls].W}x${CLASSES[cls].H}, ${(webp.length / 1024).toFixed(1)} KB)`);
    if (webp.length > BUDGET) throw new Error(`menu-art: ${cls} is ${Math.round(webp.length / 1024)} KB, over the ${BUDGET / 1024} KB budget`);
  }
} finally { await browser.close(); }
