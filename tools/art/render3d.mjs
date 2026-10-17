// Runs tools/render3d/ in headless Chromium (playwright-core) and returns its sprites as { name, img, anchor }.
// Needs a Chromium: CHROMIUM_PATH, or Playwright's (`npx playwright install chromium`).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const root = new URL('../../', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  if (!existsSync(base)) return undefined;
  for (const d of readdirSync(base).sort().reverse()) {
    for (const rel of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
      const p = join(base, d, rel); if (existsSync(p)) return p;
    }
  }
  return undefined;
}

export async function render3d(filter = '') {
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('http://art.local/**', (route) => {
    const p = join(root, new URL(route.request().url()).pathname);
    if (!existsSync(p)) return route.fulfill({ status: 404, body: 'not found' });
    route.fulfill({ status: 200, contentType: TYPES[extname(p)] || 'application/octet-stream', body: readFileSync(p) });
  });
  await page.goto('http://art.local/tools/render3d/index.html');
  await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 }).catch(() => { throw new Error('renderer page failed: ' + errors.join('; ')); });
  const list = await page.evaluate((f) => window.render(f), filter);
  await browser.close();
  if (errors.length) console.warn('renderer warnings:', errors.slice(0, 5).join('; '));
  return list.map(s => ({ name: s.name, img: { w: s.w, h: s.h, data: new Uint8ClampedArray(Buffer.from(s.data, 'base64')) }, anchor: s.anchor }));
}
