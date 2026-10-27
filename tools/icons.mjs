// The app icons the install prompt wants (Chrome asks for PNGs of 192 and 512 pixels, and a maskable one), drawn from
// public/icon.svg in headless Chromium (tools/chromium.mjs) and written with the art's own PNG encoder, so the same
// SVG gives the same files. The maskable one is the icon at 80% on a full square of its background colour: the
// launcher's mask (a circle, a squircle) only ever cuts that colour. Run after changing the SVG:
//   node tools/icons.mjs        (writes public/icon-192.png, icon-512.png, icon-maskable-512.png; output is committed)
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChromium } from './chromium.mjs';
import { encodePNG } from './art/png.js';

const pub = new URL('../public/', import.meta.url);
const svg = readFileSync(new URL('icon.svg', pub), 'utf8');
const bg = svg.match(/<rect[^>]*fill="(#[0-9a-f]{6})"/i)?.[1];
if (!bg) throw new Error('icon.svg: no background <rect fill> found');

/** [file, size, scale of the icon in the square, background behind it (null: transparent)] */
const ICONS = [['icon-192.png', 192, 1, null], ['icon-512.png', 512, 1, null], ['icon-maskable-512.png', 512, 0.8, bg]];

const browser = await launchChromium();
try {
  const page = await browser.newPage();
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
