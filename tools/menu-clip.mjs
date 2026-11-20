// The poster of the gameplay clip on the menu's first page, public/menu/clip-<width>.webp (index.html's #menuClip;
// src/client/menuclip.js plays the clip over it). The clip and its poster are the docs' (public/docs/media/trailer.mp4,
// public/docs/img/shots/hero-home-*.webp: tools/docs/shots.mjs), but the docs are web-only (tools/offline/plugin.mjs
// WEB_ONLY: not in the offline cache), and the menu is the game's page: an installed copy with no connection would show
// an empty frame. So the menu has its own copies, in the game's files:
//   clip-720.webp    the docs' 720 px poster, byte for byte (test/menu-clip.test.js: a clip recorded again fails it
//                    until this has run);
//   clip-1280.webp   the docs' 2000 px one, scaled down by Chromium (the same encoder and quality as the docs' shots).
// No 2000 px copy: the clip itself is 1000 px wide, so past 1280 a sharper poster would only be swapped for a softer
// video a moment later (and a phone at 3x, whose clip is some 450 px wide, would fetch 133 KB in place of 70).
// Run after the clip changes (tools/docs/shots.mjs's clip step does it itself):
//   node tools/menu-clip.mjs     (a Chromium: npx playwright-core install chromium; output is committed)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const SHOTS = new URL('public/docs/img/shots/', root), OUT = new URL('public/menu/', root);
const MID = 1280, QUALITY = 0.82;

/** Write the menu's posters from the docs' (`browser`: a Chromium to encode with). */
export async function menuClip(browser) {
  const shots = JSON.parse(readFileSync(new URL('tools/docs/shots.json', root), 'utf8')), files = shots[shots.trailer.poster].files;
  const small = readFileSync(new URL(files.phone, SHOTS)), big = readFileSync(new URL(files.desktop, SHOTS));
  const page = await browser.newPage();
  try {
    const mid = await page.evaluate(async ({ b64, W, q }) => {
      const img = new Image(); img.src = 'data:image/webp;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = W; cv.height = Math.round(img.naturalHeight * W / img.naturalWidth);
      const g = cv.getContext('2d', { alpha: false }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cv.width, cv.height);
      return cv.toDataURL('image/webp', q).split(',')[1];
    }, { b64: big.toString('base64'), W: MID, q: QUALITY });
    writeFileSync(new URL('clip-720.webp', OUT), small);
    writeFileSync(new URL(`clip-${MID}.webp`, OUT), Buffer.from(mid, 'base64'));
    console.log(`menu-clip: clip-720.webp (${Math.round(small.length / 1024)} KB), clip-${MID}.webp (${Math.round(Buffer.from(mid, 'base64').length / 1024)} KB)`);
  } finally { await page.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { launchChromium } = await import('./chromium.mjs');
  const browser = await launchChromium();
  try { await menuClip(browser); } finally { await browser.close(); }
}
