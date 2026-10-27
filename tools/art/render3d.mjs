// Runs tools/render3d/ in headless Chromium (playwright-core) and returns its sprites as { name, img, anchor } (masks:
// `trim`; unit frames: `anim`, `frame`), and `.tints`, the mask tint per seat (tools/render3d/main.js fitTints).
// Needs a Chromium: CHROMIUM_PATH, or the one matching playwright-core (`npx playwright-core install chromium`).
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from '../chromium.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

export async function render3d(filter = '') {
  const browser = await launchChromium();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('http://art.local/**', (route) => {
    const p = join(root, new URL(route.request().url()).pathname);
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
  await page.goto('http://art.local/tools/render3d/index.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => { throw new Error('renderer page failed: ' + errors.join('; ')); });
  const { sprites: list, tints } = await page.evaluate((f) => window.render(f), filter);
  await browser.close();
  if (errors.length) console.warn('renderer warnings:', errors.slice(0, 5).join('; '));
  const sprites = list.map(({ data, w, h, ...s }) => ({ ...s, img: { w, h, data: new Uint8ClampedArray(Buffer.from(data, 'base64')) } })); // + trim, anim, frame
  return Object.assign(sprites, { tints });
}
