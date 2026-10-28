// The app icons the install prompt wants (Chrome asks for PNGs of 192 and 512 pixels, and a maskable one) and the
// Apple touch icon, drawn from public/icon.svg in headless Chromium (tools/chromium.mjs) and written with the art's
// own PNG encoder, so the same SVG gives the same files. The maskable one is the icon on a full square of its
// background colour, scaled so that everything drawn keeps inside the safe zone, the circle of radius 40% that a
// launcher's mask (a circle, a squircle) never cuts: the scale is fitted to the icon's content (the farthest drawn
// pixel from the centre), at most 80%. The Apple touch icon (180, iOS rounds its own corners, no transparency) is
// the icon at 80% on the same square. Run after changing the SVG:
//   node tools/icons.mjs        (writes public/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png;
//                                output is committed)
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';
import { encodePNG } from './art/png.js';

const pub = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', pub), 'utf8');
const bg = svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)?.[1];
if (!bg) throw new Error('icon.svg: no background <rect fill> found');

const SAFE = 0.4, MARGIN = 0.01; // the maskable safe zone's radius (of the icon's width), and what to keep clear of it

const browser = await launchChromium();
try {
  const page = await browser.newPage();
  // How far from the centre the icon draws (as a fraction of its width): its own background and transparency do not count.
  const reach = await page.evaluate(async ({ svg, bg }) => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(svg); await img.decode();
    const n = 512, cv = document.createElement('canvas'); cv.width = cv.height = n;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data, want = [1, 3, 5].map(i => parseInt(bg.slice(i, i + 2), 16));
    let r2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128 || (Math.abs(d[i] - want[0]) < 6 && Math.abs(d[i + 1] - want[1]) < 6 && Math.abs(d[i + 2] - want[2]) < 6)) continue;
      const p = i / 4, x = p % n + 0.5 - n / 2, y = Math.floor(p / n) + 0.5 - n / 2; r2 = Math.max(r2, x * x + y * y);
    }
    return Math.sqrt(r2) / n;
  }, { svg, bg });
  // Fitted to what is drawn, not to the square: a mark on its own plate (a circle of the background's colour) is scaled up
  // past 1 so it fills the launcher's shape as much as the safe zone allows (the plate's edge is the background, unseen).
  // iOS rounds a square's corners only a little (about 22%): its icon may reach a little further than the safe circle.
  const fit = (r) => Math.min(1.4, Math.floor((r - MARGIN) / reach * 100) / 100);
  const maskable = fit(SAFE), apple = fit(0.44);
  console.log(`icons: the icon reaches ${reach.toFixed(3)} of its width from the centre; the maskable one at ${maskable}, the Apple one at ${apple}`);
  /** [file, size, scale of the icon in the square, background behind it (null: transparent)] */
  const ICONS = [['icon-192.png', 192, 1, null], ['icon-512.png', 512, 1, null], ['icon-maskable-512.png', 512, maskable, bg], ['apple-touch-icon.png', 180, apple, bg]];
  for (const [file, size, scale, fill] of ICONS) {
    const data = await page.evaluate(async ({ svg, size, scale, fill }) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      await img.decode();
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d');
      if (fill) { g.fillStyle = fill; g.fillRect(0, 0, size, size); }
      const s = size * scale, o = (size - s) / 2;
      g.drawImage(img, o, o, s, s);
      return [...g.getImageData(0, 0, size, size).data];
    }, { svg, size, scale, fill });
    writeFileSync(new URL(file, pub), encodePNG({ w: size, h: size, data: Uint8Array.from(data) }));
    console.log(`icons: wrote public/${file}`);
  }
} finally { await browser.close(); }
